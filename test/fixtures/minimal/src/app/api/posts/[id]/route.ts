export async function GET(
  _request: Request,
  context: { params: Record<string, string | string[]> },
): Promise<Response> {
  return Response.json({ id: context.params.id });
}
