/** @format */

import { Injectable } from "@angular/core";
import { HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { ApiService } from "projects/core";
import {
  ModerationVerificationDecisionPayload,
  ModerationVerificationDecisionResponse,
  ModerationVerificationPage,
  ModerationVerificationQuery,
  ProgramVerificationRequest,
  RejectionReason,
} from "./moderation.models";

@Injectable({
  providedIn: "root",
})
export class ModerationService {
  private readonly MODERATION_URL = "/api/admin/moderation";

  constructor(private readonly apiService: ApiService) {}

  getVerificationRequests(
    query: ModerationVerificationQuery
  ): Observable<ModerationVerificationPage> {
    let params = new HttpParams();

    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        const paramName = key === "pageSize" ? "page_size" : key;
        params = params.set(paramName, String(value));
      }
    });

    return this.apiService.get<ModerationVerificationPage>(
      `${this.MODERATION_URL}/verification/`,
      params
    );
  }

  getVerificationRequest(requestId: number): Observable<ProgramVerificationRequest> {
    return this.apiService.get<ProgramVerificationRequest>(
      `${this.MODERATION_URL}/verification/${requestId}/`
    );
  }

  decideVerification(
    requestId: number,
    payload: ModerationVerificationDecisionPayload
  ): Observable<ModerationVerificationDecisionResponse> {
    return this.apiService.post<ModerationVerificationDecisionResponse>(
      `${this.MODERATION_URL}/verification/${requestId}/decision/`,
      payload
    );
  }

  getVerificationRejectionReasons(): Observable<RejectionReason[]> {
    return this.apiService.get<RejectionReason[]>(
      `${this.MODERATION_URL}/verification/rejection-reasons/`
    );
  }
}
