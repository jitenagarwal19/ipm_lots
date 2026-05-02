import ReviewDetailClient from "./ReviewDetailClient";

export default function Page() {
  return <ReviewDetailClient />;
}

export function generateStaticParams() {
  return [{ id: "placeholder" }];
}
