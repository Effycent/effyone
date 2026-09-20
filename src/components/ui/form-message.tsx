type Props = {
  tone: "error" | "info";
  children: React.ReactNode;
};

export function FormMessage({ tone, children }: Props) {
  const styles =
    tone === "error"
      ? "border-danger text-danger"
      : "border-asphalt-600 text-asphalt-200";
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`border-l-4 bg-asphalt-900 px-4 py-3 text-sm ${styles}`}
    >
      {children}
    </p>
  );
}
