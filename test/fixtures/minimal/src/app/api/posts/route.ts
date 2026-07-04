export async function GET(): Promise<Response> {
  return Response.json([{ id: 1, title: "Hello" }]);
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json();
  return Response.json({ id: 2, ...body }, { status: 201 });
}
