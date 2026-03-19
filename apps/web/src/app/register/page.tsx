import { redirect } from "next/navigation";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** /register nikdy neobsluhujeme – s tokenem (pozvání do klientské zóny) jdeme na přihlášení, jinak na úvod. */
export default async function RegisterPage({ searchParams }: Props) {
  const params = await searchParams;
  const token = params?.token && typeof params.token === "string" ? params.token : null;
  if (token) {
    const q = new URLSearchParams();
    q.set("register", "1");
    q.set("token", token);
    redirect("/prihlaseni?" + q.toString());
  }
  const q = new URLSearchParams();
  q.set("register", "1");
  redirect("/?" + q.toString());
}
