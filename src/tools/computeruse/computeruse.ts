import type { Tool } from "../../types";

/**
 * computerUse creates a new computer use tool with the given
 * model adapter. Note that this only works with adapters and models
 * that support computer use, such as:
 *
 * - Anthropic
 */
export const computerUse = (_driver?: Driver): Tool.Builtin<any> => {
  return {
    ...anthropicToolDefinition,
    handler: async (input) => {
      // TODO: Figure out some stuff.
      console.log(input);
    },
  };
}

const anthropicToolDefinition = {
  name: "computer",
  builtin: true as true,
  // definition is the builtin definition of the tool.  Some tools are provided
  // directly by model providers and do not need inputs, outputs, etc.
  definition: {
    "type": "computer_20241022",
    "name": "computer",
    "display_width_px": 1024,
    "display_height_px": 768,
    "display_number": 1
  },
};

type Action = "key" |
  "type" |
  "mouse_move" |
  "left_click" |
  "left_click_drag" |
  "right_click" |
  "middle_click" |
  "double_click" |
  "screenshot" |
  "cursor_position";

interface Driver {
  screenshot(): Promise<any>;
  perform(action: Action): Promise<any>;
}

// VNC allows you to control a desktop via VNC.  
class VNC implements Driver {
  async screenshot(): Promise<any> {
    throw new Error("nah");
  }

  async perform(action: Action): Promise<any> {
    throw new Error("nah");
  }
}
