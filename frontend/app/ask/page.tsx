import { Suspense } from "react";

import { PageHeader } from "../components/PageHeader";
import { SearchChat } from "../components/SearchChat";

export default function AskPage() {
  return (
    <div>
      <PageHeader
        title="Ask"
        description="Ask questions in natural language. RaidDocs retrieves relevant chunks and returns a grounded answer with citations."
      />
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <Suspense
          fallback={
            <div className="flex h-[calc(100vh-8rem)] max-h-[900px] items-center justify-center rounded-xl border border-border bg-surface text-sm text-muted">
              Loading…
            </div>
          }
        >
          <SearchChat />
        </Suspense>
      </div>
    </div>
  );
}
