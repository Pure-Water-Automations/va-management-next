"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DiscoverModal } from "@/components/DiscoverModal";

export function DiscoverButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        ✨ Find projects in comms
      </Button>
      {open && <DiscoverModal onClose={() => setOpen(false)} />}
    </>
  );
}
