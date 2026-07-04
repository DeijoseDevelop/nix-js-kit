export async function greet(name: string): Promise<string> {
  return `Hello, ${name}!`;
}

export async function subscribe(input: { email: string }): Promise<string> {
  if (!input.email.includes("@")) throw new Error("Invalid email");
  return `Subscribed: ${input.email}`;
}
