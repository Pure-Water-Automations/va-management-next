// Console mode — deployment-level switch for special-purpose instances.
//
// CONSOLE_MODE="sales" turns the deployment into the sales/marketing/client
// test environment (the discovery.pwasecondbrain.uk box): the HR / Payroll /
// Recruitment / VA / Recordings surfaces are disabled (middleware redirects
// them to /sales) and every staff login lands on the Sales console.
export function isSalesConsoleMode(): boolean {
  return process.env.CONSOLE_MODE === "sales";
}
