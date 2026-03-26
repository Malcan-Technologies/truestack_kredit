"use client";

import { Share2, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import {
  InstagramIcon,
  TikTokIcon,
  FacebookIcon,
  LinkedInIcon,
  XTwitterIcon,
} from "../ui/social-media-icons";

interface SocialMediaData {
  instagram: string;
  tiktok: string;
  facebook: string;
  linkedin: string;
  xTwitter: string;
}

interface SocialMediaCardProps {
  data: SocialMediaData;
  onChange: (updates: Partial<SocialMediaData>) => void;
}

const SOCIAL_FIELDS: Array<{
  key: keyof SocialMediaData;
  label: string;
  placeholder: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    key: "instagram",
    label: "Instagram",
    placeholder: "https://instagram.com/username",
    Icon: InstagramIcon,
  },
  {
    key: "tiktok",
    label: "TikTok",
    placeholder: "https://tiktok.com/@username",
    Icon: TikTokIcon,
  },
  {
    key: "facebook",
    label: "Facebook",
    placeholder: "https://facebook.com/username",
    Icon: FacebookIcon,
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    placeholder: "https://linkedin.com/in/username",
    Icon: LinkedInIcon,
  },
  {
    key: "xTwitter",
    label: "X (Twitter)",
    placeholder: "https://x.com/username",
    Icon: XTwitterIcon,
  },
];

export function SocialMediaCard({ data, onChange }: SocialMediaCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Share2 className="h-5 w-5 text-muted-foreground" />
          Social Media Profiles
        </CardTitle>
        <CardDescription>Optional profile links</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SOCIAL_FIELDS.map(({ key, label, placeholder, Icon }) => {
            const val = data[key]?.trim();
            return (
              <div key={key}>
                <Label className="text-xs text-muted-foreground flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {label}
                </Label>
                <div className="mt-1 flex gap-2">
                  <Input
                    value={data[key]}
                    onChange={(e) => onChange({ [key]: e.target.value })}
                    placeholder={placeholder}
                    className="flex-1"
                  />
                  {val ? (
                    <a
                      href={val.startsWith("http") ? val : `https://${val}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 p-2 rounded-md border border-input bg-background hover:bg-accent"
                      title="Open link"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
