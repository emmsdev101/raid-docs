import { Suspense } from "react";

import { PageHeader } from "../components/PageHeader";
import { SearchResults } from "../components/SearchResults";

export default function SearchPage() {
  return (
    <div>
      <PageHeader
        title="Search"
        description="Search your workspace by document name or topic. Browse ranked results and skim an AI insight on what they cover."
      />
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <Suspense
          fallback={
            <div className="rounded-xl border border-border bg-surface px-6 py-10 text-center text-sm text-muted">
              Loading search…
            </div>
          }
        >
          <SearchResults />
        </Suspense>
      </div>
    </div>
  );
}
