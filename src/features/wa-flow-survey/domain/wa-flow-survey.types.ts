export type FlowResponseAnswerInput = {
  questionKey: string;
  questionLabel: string;
  valueText: string | null;
};

export type StoreFlowResponseInput = {
  orgId: string;
  credentialId?: string;
  waId: string;
  waBusinessNumber: string;
  providerMessageId: string;
  contextMessageId?: string;
  interaktFlowId: string;
  templateName?: string;
  callbackData?: string;
  flowToken?: string;
  responseJson: Record<string, unknown>;
  rawPayload: unknown;
  submittedAt: Date;
  answers: FlowResponseAnswerInput[];
};

export type WaFlowSurveyListItem = {
  id: string;
  orgId: string;
  interaktFlowId: string;
  templateName: string | null;
  title: string | null;
  submissionCount: number;
  lastSubmittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type WaFlowQuestionAnalytics = {
  questionKey: string;
  questionLabel: string;
  totalAnswers: number;
  options: Array<{ value: string; count: number }>;
};

export type WaFlowSurveyAnalytics = {
  survey: {
    id: string;
    orgId: string;
    interaktFlowId: string;
    templateName: string | null;
    title: string | null;
    submissionCount: number;
  };
  questions: WaFlowQuestionAnalytics[];
};

export type WaFlowSubmissionListItem = {
  id: string;
  waId: string;
  providerMessageId: string;
  templateName: string | null;
  callbackData: string | null;
  responseJson: unknown;
  submittedAt: Date;
  createdAt: Date;
};
