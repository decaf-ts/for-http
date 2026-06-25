import { logParameterRegistry } from "@decaf-ts/logging";

logParameterRegistry.register({
  key: "ip",
  shouldInclude(payload) {
    return Boolean((payload.config as Record<string, unknown>).ip);
  },
  render(payload) {
    return String((payload.config as Record<string, unknown>).ip);
  },
  style(rendered, payload) {
    return payload.applyTheme(rendered, "id");
  },
});
