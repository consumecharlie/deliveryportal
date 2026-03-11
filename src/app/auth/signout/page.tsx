"use client";

import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export default function SignOutPage() {
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut({ callbackUrl: "/auth/signin" });
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <LogOut className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle className="text-xl">Sign Out</CardTitle>
          <CardDescription>
            Are you sure you want to sign out of the Deliverable Portal?
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full"
          >
            {signingOut ? "Signing out..." : "Sign Out"}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => window.history.back()}
            disabled={signingOut}
          >
            Cancel
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
