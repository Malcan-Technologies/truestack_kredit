"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/** Supporting documents live on `/applications/[id]`. */
export default function ApplicationDocumentsRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";

  useEffect(() => {
    if (id) {
      router.replace(`/applications/${id}`);
    }
  }, [id, router]);

  return null;
}
