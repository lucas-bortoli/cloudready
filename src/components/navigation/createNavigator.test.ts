import { createRoot, flush } from "solid-js";
import { expect, it } from "vitest";
import { createNavigator } from "./createNavigator";

it("restores entry state and respects leave guards", () => {
  const { navigation, dispose } = createRoot((dispose) => ({
    navigation: createNavigator<string, number>("home"),
    dispose,
  }));
  navigation.setEntryState(42);
  flush();
  navigation.push("report");
  flush();
  const removeGuard = navigation.registerLeaveGuard(() => false);
  expect(navigation.push("settings")).toBe(false);
  expect(navigation.goBack()).toBe(false);
  expect(navigation.route()).toBe("report");
  removeGuard();
  navigation.push("settings");
  flush();
  navigation.goBack();
  flush();
  expect(navigation.route()).toBe("report");
  navigation.goBack();
  flush();
  expect(navigation.entry().state).toBe(42);
  expect(navigation.canGoBack()).toBe(false);
  dispose();
});
