export function getEmailFromHeaders(input: Headers): string | null {
  const email = input.get("cf-access-authenticated-user-email");
  if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return email.toLowerCase();
  }
  return null;
}
