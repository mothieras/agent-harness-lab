import { AsyncLocalStorage } from "node:async_hooks";

export const agentIdentity = new AsyncLocalStorage<string>();
