"use client";

import { useActionState, useState } from "react";
import { saveProfileAction, type OnboardingFormState } from "@/app/(app)/onboarding/actions";
import { TextField, SelectField, FormError } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/Button";
import { CAMEROON_REGIONS, COVERAGE_TIERS, DEPENDENT_RELATIONSHIPS } from "@/lib/validation/profile.schema";

interface DependentRow {
  relationship: (typeof DEPENDENT_RELATIONSHIPS)[number];
  dateOfBirth: string;
  hasExistingConditions: boolean;
}

interface OnboardingFormProps {
  initialProfile: {
    dateOfBirth: string;
    region: string;
    desiredTier: string;
    hasExistingConditions: boolean;
    conditionsNotes: string;
  } | null;
  initialDependents: DependentRow[];
}

const initialState: OnboardingFormState = {};

export function OnboardingForm({ initialProfile, initialDependents }: OnboardingFormProps) {
  const [state, formAction] = useActionState(saveProfileAction, initialState);
  const [dependents, setDependents] = useState<DependentRow[]>(initialDependents);

  function addDependent() {
    setDependents((rows) => [...rows, { relationship: "CHILD", dateOfBirth: "", hasExistingConditions: false }]);
  }

  function removeDependent(index: number) {
    setDependents((rows) => rows.filter((_, i) => i !== index));
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="dependentCount" value={dependents.length} />

      <fieldset className="flex flex-col gap-4">
        <legend className="text-base font-semibold text-slate-900">Your details</legend>
        <TextField
          label="Date of birth"
          name="dateOfBirth"
          type="date"
          required
          defaultValue={initialProfile?.dateOfBirth ?? ""}
        />
        <SelectField label="Region" name="region" required defaultValue={initialProfile?.region ?? ""}>
          <option value="" disabled>
            Select your region
          </option>
          {CAMEROON_REGIONS.map((region) => (
            <option key={region} value={region}>
              {region}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Coverage tier you want to compare"
          name="desiredTier"
          required
          defaultValue={initialProfile?.desiredTier ?? "STANDARD"}
        >
          {COVERAGE_TIERS.map((tier) => (
            <option key={tier} value={tier}>
              {tier.charAt(0) + tier.slice(1).toLowerCase()}
            </option>
          ))}
        </SelectField>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="hasExistingConditions"
            defaultChecked={initialProfile?.hasExistingConditions ?? false}
            className="h-4 w-4 rounded border-slate-300 text-emerald-700"
          />
          I have an existing medical condition
        </label>
        <TextField
          label="Tell us about it (optional)"
          name="conditionsNotes"
          defaultValue={initialProfile?.conditionsNotes ?? ""}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <legend className="text-base font-semibold text-slate-900">Dependents</legend>
          <button
            type="button"
            onClick={addDependent}
            className="text-sm font-medium text-emerald-700 hover:underline"
          >
            + Add dependent
          </button>
        </div>
        {dependents.length === 0 && (
          <p className="text-sm text-slate-500">No dependents added. Add a spouse or child to include them in your quote.</p>
        )}
        {dependents.map((dependent, index) => (
          <div key={index} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Dependent {index + 1}</span>
              <button
                type="button"
                onClick={() => removeDependent(index)}
                className="text-sm text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
            <SelectField
              label="Relationship"
              name={`dependent_relationship_${index}`}
              defaultValue={dependent.relationship}
            >
              {DEPENDENT_RELATIONSHIPS.map((relationship) => (
                <option key={relationship} value={relationship}>
                  {relationship.charAt(0) + relationship.slice(1).toLowerCase()}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Date of birth"
              name={`dependent_dob_${index}`}
              type="date"
              required
              defaultValue={dependent.dateOfBirth}
            />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name={`dependent_conditions_${index}`}
                defaultChecked={dependent.hasExistingConditions}
                className="h-4 w-4 rounded border-slate-300 text-emerald-700"
              />
              Has an existing medical condition
            </label>
          </div>
        ))}
      </fieldset>

      <FormError message={state.error} />
      <SubmitButton>See my quotes</SubmitButton>
    </form>
  );
}
