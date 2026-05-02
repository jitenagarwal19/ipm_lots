import LotViewClient from "./LotViewClient";

export default function Page() {
  return <LotViewClient />;
}

export function generateStaticParams() {
  return [{ id: "placeholder" }];
}
