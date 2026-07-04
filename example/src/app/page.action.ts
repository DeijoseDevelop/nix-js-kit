export async function greet(name: string): Promise<string> {
  return `Hello, ${name}!`;
}

export async function subscribe(input: { email: string }): Promise<string> {
  // Simulate server-side validation and persistence.
  if (!input.email.includes("@")) {
    throw new Error("Invalid email address");
  }
  return `Subscribed: ${input.email}`;
}
