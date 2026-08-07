import { TenkiSandbox, Session } from "@tenkicloud/sandbox";
import { AgentResult, NetworkRun } from "@inngest/agent-kit";
import type { TextMessage } from "@inngest/agent-kit";

// All agent work happens inside this directory (sandbox user: `tenki`).
export const WORKSPACE_DIR = "/home/tenki/workspace";

export function extractTextMessageContent(
  result: AgentResult | undefined
): string {
  const textMessage = result?.output.find(
    (msg) => msg.type === "text"
  ) as TextMessage;
  if (!textMessage || !textMessage.content) return "";
  if (typeof textMessage.content === "string") return textMessage.content;
  if (Array.isArray(textMessage.content)) {
    return textMessage.content.map((c) => c.text).join("");
  }
  return "";
}

// `createAndWait` can return before the sandbox data plane is stable: the
// first exec may hit transient transport errors (HTTP/2 CANCEL, TLS) or
// hang, so each attempt is bounded by a timeout and retried with backoff.
const FIRST_EXEC_ATTEMPTS = 3;
const FIRST_EXEC_TIMEOUT_MS = 15_000;
const FIRST_EXEC_RETRY_DELAY_MS = 2_000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Timed out after ${ms} ms`)),
      ms
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function createSession(
  network?: NetworkRun<Record<string, any>>
) {
  // Reads the auth token from TENKI_AUTH_TOKEN, then TENKI_API_KEY.
  const client = new TenkiSandbox();
  let session: Session;
  try {
    session = await client.createAndWait({
      name: "agentkit-coding-agent",
      // Off by default; needed for `npm install` and `git clone`.
      allowOutbound: true,
      // Required for the dev server preview URL.
      allowInbound: true,
      maxDurationMs: 30 * 60 * 1000,
    });
  } catch (error) {
    throw new Error(`Failed to create Tenki session: ${error}`);
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= FIRST_EXEC_ATTEMPTS; attempt++) {
    try {
      await withTimeout(
        session.exec("mkdir", { args: ["-p", WORKSPACE_DIR] }),
        FIRST_EXEC_TIMEOUT_MS
      );
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      if (attempt < FIRST_EXEC_ATTEMPTS) {
        console.log(
          `Session not reachable yet (attempt ${attempt}/${FIRST_EXEC_ATTEMPTS}): ${error}. Retrying...`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, FIRST_EXEC_RETRY_DELAY_MS * attempt)
        );
      }
    }
  }
  if (lastError !== undefined) {
    // The VM already exists at this point; tear it down before propagating
    // so a setup failure doesn't leave it running until its max duration.
    await session.closeIfOpen();
    throw new Error(`Failed to prepare the session workspace: ${lastError}`);
  }
  if (network) network.state.data.session = session;
  return session;
}

export async function getSession(network?: NetworkRun<Record<string, any>>) {
  let session = network?.state.data.session as Session;
  if (!session) session = await createSession(network);
  return session;
}

// Resolves agent-provided workspace-relative paths to absolute ones.
export function resolveWorkspacePath(path: string) {
  return path.startsWith("/") ? path : `${WORKSPACE_DIR}/${path}`;
}

// Enabled with ENABLE_DEBUG_LOGS=true (see .env.example).
export const logDebug = (message: string) => {
  if (process.env.ENABLE_DEBUG_LOGS === "true") console.log(message);
};

// Offset from the dev-server port to the relay's listen port.
const RELAY_PORT_OFFSET = 1000;

const RELAY_SCRIPT = `
import asyncio, sys
target_port, listen_port = int(sys.argv[1]), int(sys.argv[2])

async def handle(reader, writer):
    try:
        upstream_reader, upstream_writer = await asyncio.open_connection("127.0.0.1", target_port)
    except OSError:
        writer.close()
        return
    async def pipe(src, dst):
        try:
            while True:
                data = await src.read(65536)
                if not data:
                    break
                dst.write(data)
                await dst.drain()
        except OSError:
            pass
        finally:
            try:
                dst.close()
            except OSError:
                pass
    await asyncio.gather(pipe(reader, upstream_writer), pipe(upstream_reader, writer))

async def main():
    server = await asyncio.start_server(handle, "0.0.0.0", listen_port)
    async with server:
        await server.serve_forever()

asyncio.run(main())
`;

async function probePortBinding(
  session: Session,
  port: number
): Promise<"wildcard" | "loopback" | "none"> {
  const probe = await session.exec("python3", {
    args: [
      "-c",
      `
import sys
port = int(sys.argv[1])
wildcard = loopback = False
for path in ("/proc/net/tcp", "/proc/net/tcp6"):
    try:
        lines = open(path).read().splitlines()[1:]
    except OSError:
        continue
    for line in lines:
        fields = line.split()
        local, state = fields[1], fields[3]
        if state != "0A":  # LISTEN
            continue
        addr, p = local.rsplit(":", 1)
        if int(p, 16) != port:
            continue
        if addr in ("00000000", "00000000000000000000000000000000"):
            wildcard = True
        else:
            loopback = True
print("wildcard" if wildcard else "loopback" if loopback else "none")
`,
      String(port),
    ],
  });
  return new TextDecoder().decode(probe.stdout).trim() as
    | "wildcard"
    | "loopback"
    | "none";
}

/**
 * Returns a port for `exposePort` reachable from outside the sandbox: dev
 * servers bound to loopback only (e.g. Vite without `--host`) would 502
 * through the preview proxy, so a TCP relay on 0.0.0.0 bridges them.
 */
export async function ensureExternallyReachable(
  session: Session,
  port: number
): Promise<number> {
  // The dev server may still be binding when the agent reports the port;
  // poll briefly before concluding that nothing is listening.
  let binding = await probePortBinding(session, port);
  for (let attempts = 0; binding === "none" && attempts < 10; attempts++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    binding = await probePortBinding(session, port);
  }
  if (binding === "none")
    throw new Error(
      `Nothing is listening on port ${port}; refusing to expose it (the preview URL would return 502).`
    );
  if (binding === "wildcard") return port;

  // Find a free port for the relay: skip anything already listening.
  let relayPort = port + RELAY_PORT_OFFSET;
  for (let attempts = 0; attempts < 10; attempts++) {
    if ((await probePortBinding(session, relayPort)) === "none") break;
    relayPort++;
  }

  console.log(
    `Dev server on port ${port} is bound to loopback only; bridging it to 0.0.0.0:${relayPort} for the preview URL.`
  );
  await session.writeFile("/home/tenki/.port-relay.py", RELAY_SCRIPT);
  // Fully redirected nohup'd group: outlives the exec call without hanging it.
  await session.exec("bash", {
    args: [
      "-c",
      `{ nohup python3 /home/tenki/.port-relay.py ${port} ${relayPort} ; } > /home/tenki/.port-relay.log 2>&1 </dev/null & echo started`,
    ],
  });

  // The launch reports success unconditionally; verify the relay is really up.
  await new Promise((resolve) => setTimeout(resolve, 1000));
  if ((await probePortBinding(session, relayPort)) !== "wildcard") {
    const log = new TextDecoder().decode(
      await session.readFile("/home/tenki/.port-relay.log")
    );
    throw new Error(
      `Port relay failed to start on ${relayPort}: ${log.trim() || "no log output"}`
    );
  }
  return relayPort;
}
