import {
  Accessibility,
  BellRing,
  BriefcaseBusiness,
  CakeSlice,
  Crown,
  Heart,
  Hotel,
  MapPin,
  PartyPopper,
  Repeat2,
  Sparkles,
  Tag,
  type LucideIcon,
} from "lucide-react";

const TAG_ICONS: Record<string, LucideIcon> = {
  birthday: CakeSlice,
  anniversary: Heart,
  "first visit": Sparkles,
  "business meal": BriefcaseBusiness,
  "special occasion": PartyPopper,
  accessibility: Accessibility,
  vip: Crown,
  regular: Repeat2,
  local: MapPin,
  "hotel guest": Hotel,
  concierge: BellRing,
};

type TagIconProps = {
  tag: string;
  className?: string;
};

export function TagIcon({ tag, className }: TagIconProps) {
  const Icon = TAG_ICONS[tag.trim().toLowerCase()] || Tag;
  return <Icon className={className} data-tag-icon={tag} aria-hidden="true" />;
}
