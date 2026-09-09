import { requireAuth } from "@/lib/auth/guards";
import { getExistingOnboardingData } from "./actions";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function OnboardingPage() {
  const user = await requireAuth();
  const { profile, dependents } = await getExistingOnboardingData(user.id);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900">Tell us about yourself</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">
        This is exactly what insurers price on — it takes about a minute, and you can update it any time.
      </p>
      <OnboardingForm
        initialProfile={
          profile
            ? {
                dateOfBirth: toDateInputValue(profile.dateOfBirth),
                region: profile.region,
                desiredTier: profile.desiredTier,
                hasExistingConditions: profile.hasExistingConditions,
                conditionsNotes: profile.conditionsNotes ?? "",
              }
            : null
        }
        initialDependents={dependents.map((dependent) => ({
          relationship: dependent.relationship,
          dateOfBirth: toDateInputValue(dependent.dateOfBirth),
          hasExistingConditions: dependent.hasExistingConditions,
        }))}
      />
    </div>
  );
}
