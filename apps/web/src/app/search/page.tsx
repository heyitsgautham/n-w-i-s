import { SearchScreen } from "@/components/search/search-screen";

/** Plain-English search over the parsed reports. `?q=` runs a question on arrival. */
export default async function SearchPage(props: PageProps<"/search">) {
  const { q } = await props.searchParams;
  return <SearchScreen initialQuery={typeof q === "string" ? q : ""} />;
}
