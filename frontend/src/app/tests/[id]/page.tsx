import TestViewClient from "./TestViewClient";

export default function Page() {
  return <TestViewClient />;
}

export function generateStaticParams() {
  return [{ id: "placeholder" }];
}
