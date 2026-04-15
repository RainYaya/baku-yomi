export type SynthesisOptions = {
  speedScale?: number;
  pitchScale?: number;
  volumeScale?: number;
};

export type Speaker = {
  name: string;
  speaker_uuid: string;
  styles: { id: number; name: string }[];
};

export interface TTSProvider {
  readonly name: string;
  synthesize(text: string, speaker: number, options?: SynthesisOptions): Promise<Buffer>;
  getSpeakers(): Promise<Speaker[]>;
}
