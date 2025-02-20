export type InngestRunStatus =
  | "not-started"
  | "Running"
  | "Completed"
  | "Failed"
  | "Cancelled";

export type InngestRunInfo = {
  output?: string;
  status: InngestRunStatus;
};

export async function getRuns(eventId: string): Promise<InngestRunInfo[]> {
  const response = await fetch(
    process.env.INNGEST_SIGNING_KEY
      ? `https://api.inngest.com/v1/events/${eventId}/runs`
      : `http://localhost:8288/v1/events/${eventId}/runs`,
    {
      ...(process.env.INNGEST_SIGNING_KEY
        ? {
            headers: {
              Authorization: `Bearer ${process.env.INNGEST_SIGNING_KEY}`,
            },
          }
        : {}),
    }
  );
  const json = await response.json();
  return json.data;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
