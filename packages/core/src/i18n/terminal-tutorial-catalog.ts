import { TERMINAL_TUTORIAL_ADVANCED_MESSAGES } from "./terminal-tutorial-advanced-catalog"
import { TERMINAL_TUTORIAL_AGENT_MESSAGES } from "./terminal-tutorial-agents-catalog"
import { TERMINAL_TUTORIAL_BASICS_MESSAGES } from "./terminal-tutorial-basics-catalog"
import { TERMINAL_TUTORIAL_DEMO_MESSAGES } from "./terminal-tutorial-demo-catalog"

export const TERMINAL_TUTORIAL_MESSAGES = [
  ...TERMINAL_TUTORIAL_BASICS_MESSAGES,
  ...TERMINAL_TUTORIAL_AGENT_MESSAGES,
  ...TERMINAL_TUTORIAL_ADVANCED_MESSAGES,
  ...TERMINAL_TUTORIAL_DEMO_MESSAGES,
] as const
