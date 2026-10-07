// Shapes returned by the API (backend/app/schemas.py)

export type Participant = { id: number; person_id: number; name: string; email: string | null; color: string; is_host: boolean };

export type Meeting = {
  id: number;
  title: string;
  started_at: string;
  duration_sec: number;
  status: "processing" | "ready" | "failed";
  source: string;
  media_url: string | null;
  overview: string;
  participants: Participant[];
  topics: string[];
};

export type Segment = {
  id: number;
  start_sec: number;
  end_sec: number;
  text: string;
  sentiment: "positive" | "neutral" | "negative";
  speaker: Participant | null;
  match: boolean;
  comment_count: number;
};

type Bullet = { id: number; text: string; timestamp_sec: number | null };
export type Section = { id: number; title: string; bullets: Bullet[] };
export type Summary = { overview: string; keywords: string[]; sections: Section[] };

export type ActionItem = {
  id: number;
  meeting_id: number;
  meeting_title: string;
  text: string;
  assignee: Participant | null;
  timestamp_sec: number | null;
  due_date: string | null;
  is_done: boolean;
};

export type Insights = {
  sentiments: Record<"positive" | "neutral" | "negative", { count: number; pct: number }>;
  speakers: { participant_id: number | null; name: string; color: string; talk_sec: number; share_pct: number; wpm: number }[];
  filters: { questions: number[]; metrics: number[]; dates_times: number[]; tasks: number[] };
};

export type Comment = { id: number; segment_id: number; start_sec: number; quote: string; author: string; body: string; created_at: string };
export type Soundbite = { id: number; start_sec: number; end_sec: number; title: string; excerpt: string; created_at: string };
export type Bookmark = { id: number; time_sec: number; note: string; created_at: string };
export type Topic = { name: string; meeting_count: number };

export type Source = { meeting_id: number; meeting_title: string; segment_id: number; start_sec: number; speaker: string };
export type ChatMessage = {
  id: number;
  meeting_id: number | null;
  role: "user" | "assistant";
  content: string;
  sources: Source[];
  provider: string | null;
  model: string | null;
  created_at: string;
};
export type AskResult = { user: ChatMessage; assistant: ChatMessage; ai: { provider: string; model: string; status: string; error: string | null } };

export type LlmModels = { default_provider: string; default_model: string; providers: { name: string; label: string; models: string[] }[] };

export type SearchResult = { meeting: Meeting; title_match: boolean; hit_count: number; hits: Segment[] };

export type Person = { id: number; name: string; email: string | null; meeting_count: number; is_me: boolean };
export type PersonDetail = Person & {
  total_talk_sec: number;
  wpm: number;
  meetings: { id: number; title: string; started_at: string; talk_sec: number; share_pct: number }[];
  open_tasks: ActionItem[];
};

export type Me = { id: number; name: string; email: string; person_id: number | null };
