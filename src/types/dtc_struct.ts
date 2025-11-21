export interface DTCStruct {
  "code": string;
  "name": string;
  "description": string;
  "affected_models": {
    brand: string; // seperate multiple brands with commas
    years: string;
    models: string;
  };
  likely_causes: string[];
  guided_steps: Array<{
    step: number;
    title: string;
    description: string;
    tools_needed: string[];
  }>;
  tutorials: {
    title: string;
    youtubeId: string;
  };
  bite_sized_insights: string[]; // optional
  sources?: string[]; // optional: reference links
}