/** Preserve employee deep links without accepting redirects to another site. */
export function employeeLoginDestination(next: string | null) {
  try {
    const url = new URL(next || "/employee", "https://attendance.invalid");
    return url.origin === "https://attendance.invalid" &&
      (url.pathname === "/employee" || url.pathname.startsWith("/employee/"))
      ? url.pathname + url.search : "/employee";
  } catch { return "/employee"; }
}
