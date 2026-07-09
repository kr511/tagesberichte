export default function LoginLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <div className="hazard-rule" />
      <main className="flex-1">{children}</main>
    </>
  );
}
