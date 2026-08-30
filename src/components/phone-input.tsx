"use client";

import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  isSupportedCountry,
  parseDigits,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { IGNORE_AUTOFILL } from "@/lib/autofill";

type PhoneInputProps = {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  normalizeInitialValue?: boolean;
};

const FALLBACK_COUNTRY: CountryCode = "US";
const subscribeToLocale = () => () => undefined;

function countryFlag(country: CountryCode) {
  return String.fromCodePoint(...country.split("").map((character) => 127397 + character.charCodeAt(0)));
}

function countryFromLocale() {
  if (typeof navigator === "undefined") return FALLBACK_COUNTRY;
  const region = new Intl.Locale(navigator.language).region;
  return region && isSupportedCountry(region) ? region : FALLBACK_COUNTRY;
}

function countryFromPhone(value: string) {
  const { number } = splitExtension(value);
  if (!number.trim().startsWith("+")) return undefined;
  const formatter = new AsYouType();
  formatter.input(number);
  return formatter.getCountry();
}

function splitExtension(value: string) {
  const match = value.match(/\s*(?:ext\.?|x)\s*(\d+)\s*$/i);
  return match
    ? { number: value.slice(0, match.index).trim(), extension: match[1] }
    : { number: value, extension: "" };
}

function nationalDigits(value: string, country: CountryCode) {
  const { number } = splitExtension(value);
  if (!number.trim().startsWith("+")) return parseDigits(number);
  const formatter = new AsYouType();
  formatter.input(number);
  if (formatter.getCountry() === country) return formatter.getNationalNumber();
  return parseDigits(number).replace(new RegExp(`^${getCountryCallingCode(country)}`), "");
}

function formatNational(value: string, country: CountryCode) {
  const { number, extension } = splitExtension(value);
  const parsed = parsePhoneNumberFromString(number);
  const suffix = extension ? ` ext. ${extension}` : "";
  if (parsed?.countryCallingCode === getCountryCallingCode(country)) {
    return `${parsed.formatNational()}${suffix}`;
  }
  const digits = nationalDigits(value, country);
  return digits ? `${new AsYouType(country).input(digits)}${suffix}` : "";
}

function internationalValue(nationalValue: string, country: CountryCode) {
  const { extension } = splitExtension(nationalValue);
  const formatter = new AsYouType(country);
  formatter.input(nationalDigits(nationalValue, country));
  const formatted = formatter.getNumber()?.formatInternational() || "";
  return formatted && extension ? `${formatted} ext. ${extension}` : formatted;
}

export function PhoneInput({
  value,
  onChange,
  autoFocus = false,
  normalizeInitialValue = false,
}: PhoneInputProps) {
  const localeCountry = useSyncExternalStore(
    subscribeToLocale,
    countryFromLocale,
    () => FALLBACK_COUNTRY,
  );
  const inferredCountry = countryFromPhone(value);
  const [selectedCountry, setSelectedCountry] = useState<CountryCode | null>(null);
  const country = inferredCountry || selectedCountry || localeCountry;
  const countryOptions = useMemo(() => {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    return getCountries()
      .map((code) => ({ code, name: names.of(code) || code }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, []);

  useEffect(() => {
    if (!normalizeInitialValue || !value.trim()) return;
    const normalized = internationalValue(value, country);
    if (normalized && normalized !== value) onChange(normalized);
  }, [country, normalizeInitialValue, onChange, value]);

  function updateCountry(nextCountry: CountryCode) {
    const digits = nationalDigits(value, country);
    setSelectedCountry(nextCountry);
    onChange(internationalValue(digits, nextCountry));
  }

  function updatePhone(rawValue: string) {
    if (rawValue.trim().startsWith("+")) {
      const formatter = new AsYouType();
      const formatted = formatter.input(rawValue);
      const nextCountry = formatter.getCountry();
      if (nextCountry) setSelectedCountry(nextCountry);
      onChange(formatted);
      return;
    }
    onChange(internationalValue(rawValue, country));
  }

  return (
    <div className="phone-field-control">
      <select
        {...IGNORE_AUTOFILL}
        aria-label="Phone country"
        value={country}
        onChange={(event) => updateCountry(event.currentTarget.value as CountryCode)}
      >
        {countryOptions.map(({ code, name }) => (
          <option key={code} value={code}>
            {countryFlag(code)} +{getCountryCallingCode(code)} · {name}
          </option>
        ))}
      </select>
      <input
        {...IGNORE_AUTOFILL}
        type="text"
        inputMode="tel"
        aria-label="Phone number"
        autoFocus={autoFocus}
        value={formatNational(value, country)}
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          updatePhone(nextValue);
        }}
        placeholder={country === "US" || country === "CA" ? "(555) 867-5309" : "Phone number"}
      />
    </div>
  );
}
