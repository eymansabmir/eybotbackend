import type {
  StoreFlowResponseInput,
  WaFlowQuestionAnalytics,
  WaFlowSubmissionListItem,
  WaFlowSurveyAnalytics,
  WaFlowSurveyListItem,
} from './wa-flow-survey.types';

export interface IWaFlowSurveyRepository {
  storeFlowResponse(input: StoreFlowResponseInput): Promise<{ surveyId: string; submissionId: string; created: boolean }>;
  listSurveys(orgId: string): Promise<WaFlowSurveyListItem[]>;
  getSurveyAnalytics(orgId: string, surveyId: string): Promise<WaFlowSurveyAnalytics | null>;
  listSubmissions(
    orgId: string,
    surveyId: string,
    limit: number,
    offset: number,
  ): Promise<{ submissions: WaFlowSubmissionListItem[]; total: number }>;
}

export type { WaFlowQuestionAnalytics };
