/**
 * Profile-related types
 */

export interface ChaturbateProfile {
  username: string;
  displayName: string | null;
  bio: string | null;
  location: string | null;
  age: number | null;
  gender: string | null;
  sexualOrientation: string | null;
  interestedIn: string | null;
  bodyType: string | null;
  ethnicity: string | null;
  hairColor: string | null;
  eyeColor: string | null;
  height: string | null;
  weight: string | null;
  languages: string[];
  tags: string[];
  photos: ProfilePhoto[];
  tipMenu: TipMenuItem[];
  goalDescription: string | null;
  goalTokens: number | null;
  goalProgress: number | null;
  socialLinks: SocialLink[];
  fanclubPrice: number | null;
  fanclubCount: number | null;
  lastBroadcast: Date | null;
  scrapedAt: Date;
}

export interface ProfilePhoto {
  url: string;
  isPrimary: boolean;
}

export interface TipMenuItem {
  item: string;
  tokens: number;
}

export interface SocialLink {
  platform: string;
  url: string;
}

export interface Profile {
  id: number;
  person_id: number;
  display_name: string | null;
  bio: string | null;
  location: string | null;
  age: number | null;
  gender: string | null;
  sexual_orientation: string | null;
  interested_in: string | null;
  body_type: string | null;
  ethnicity: string | null;
  hair_color: string | null;
  eye_color: string | null;
  height: string | null;
  weight: string | null;
  languages: string[];
  tags: string[];
  photos: ProfilePhoto[];
  tip_menu: TipMenuItem[];
  goal_description: string | null;
  goal_tokens: number | null;
  goal_progress: number | null;
  social_links: SocialLink[];
  fanclub_price: number | null;
  fanclub_count: number | null;
  last_broadcast: Date | null;
  scraped_at: Date;
  created_at: Date;
  updated_at: Date;
}
