"use client";

import { Suspense } from "react";

import { LoadingState } from "@/components/common/StateNotice";
import { SearchPage } from "@/components/search/SearchPage";

// useSearchParams needs a Suspense boundary.
export default function Search() {
  return (
    <Suspense fallback={<div className="py-8"><LoadingState label="Loading search..." /></div>}>
      <SearchPage />
    </Suspense>
  );
}
