import type { IWaFlowSurveyRepository } from '../domain/wa-flow-survey.repository';
import type { StoreFlowResponseInput } from '../domain/wa-flow-survey.types';

export class WaFlowSurveyService {
  constructor(private readonly repo: IWaFlowSurveyRepository) {}

  async storeFromJob(input: StoreFlowResponseInput) {
    return this.repo.storeFlowResponse(input);
  }

  async listSurveys(orgId: string) {
    return this.repo.listSurveys(orgId);
  }

  async getAnalytics(orgId: string, surveyId: string) {
    return this.repo.getSurveyAnalytics(orgId, surveyId);
  }

  async listSubmissions(orgId: string, surveyId: string, limit = 50, offset = 0) {
    return this.repo.listSubmissions(orgId, surveyId, limit, offset);
  }
}
