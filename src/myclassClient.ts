export interface MyClassStudentMatch {
  student_id: number;
  full_name: string;
  teacher_id: number;
  teacher_name: string | null;
  school_name: string | null;
  class_name: string | null;
}

export interface MyClassOpenPeriod {
  period: number;
  title: string;
  start_time: string;
  cutoff_time: string;
  is_quick_open: boolean;
  quick_open_until: string | null;
}

export interface MyClassAttendanceRecord {
  date: string;
  period: number;
  title: string;
  status: string;
  status_label: string;
  checked_in_at: string;
}

export interface MyClassHomeworkItem {
  id: number;
  title: string;
  description: string | null;
  subject: string | null;
  due_date: string | null;
  due_time: string | null;
  created_at: string | null;
  submitted: boolean;
  submitted_files_count: number;
  submitted_at: string | null;
  score: number | null;
  feedback: string | null;
}

export interface MyClassErrorResult {
  ok: false;
  status: number;
  code: string;
  message: string;
}

export type MyClassLookupResult =
  | {
      ok: true;
      national_code: string;
      students: MyClassStudentMatch[];
    }
  | MyClassErrorResult;

export type MyClassCheckInResult =
  | {
      ok: true;
      needs_selection: boolean;
      already_checked_in: boolean;
      message: string;
      open_periods?: MyClassOpenPeriod[];
      attendance?: MyClassAttendanceRecord;
    }
  | MyClassErrorResult;

export type MyClassHomeworksResult =
  | {
      ok: true;
      total: number;
      homeworks: MyClassHomeworkItem[];
    }
  | MyClassErrorResult;

export type MyClassSubmitResult =
  | {
      ok: true;
      message: string;
      submission: {
        homework_id: number;
        files_count: number;
        submitted_at: string | null;
        note: string | null;
      };
    }
  | MyClassErrorResult;

export interface MyClassClientLike {
  lookupNationalCode(nationalCode: string, baleUserId: number): Promise<MyClassLookupResult>;
  checkInAttendance(
    studentId: number,
    nationalCode: string,
    baleUserId: number,
    period?: number,
  ): Promise<MyClassCheckInResult>;
  listHomeworks(studentId: number, nationalCode: string): Promise<MyClassHomeworksResult>;
  submitHomework(
    homeworkId: number,
    studentId: number,
    nationalCode: string,
    files: Array<{ buffer: Buffer; filename: string; mime: string }>,
    note?: string,
  ): Promise<MyClassSubmitResult>;
}

const NOT_CONFIGURED_ERROR: MyClassErrorResult = {
  ok: false,
  status: 503,
  code: 'not_configured',
  message: 'اتصال ربات به سایت هنوز پیکربندی نشده است. لطفاً به استاد یا مدیر اطلاع دهید.',
};

const NETWORK_ERROR_MESSAGE =
  'ارتباط با سرور سایت برقرار نشد؛ لطفاً لحظاتی دیگر دوباره تلاش کنید.';

export class MyClassClient implements MyClassClientLike {
  constructor(
    private readonly baseUrl: string,
    private readonly botToken: string,
    private readonly timeoutMs = 90000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private isConfigured(): boolean {
    return this.baseUrl.trim() !== '' && this.botToken.trim() !== '';
  }

  private endpoint(path: string): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/api/myclass/bot${path}`;
  }

  private async postJson<T extends { ok: true }>(
    path: string,
    payload: Record<string, unknown>,
  ): Promise<T | MyClassErrorResult> {
    if (!this.isConfigured()) return NOT_CONFIGURED_ERROR;

    try {
      const res = await this.fetchImpl(this.endpoint(path), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${this.botToken}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) {
        return this.buildErrorResult(res.status, json);
      }

      return json as T;
    } catch {
      return {
        ok: false,
        status: 0,
        code: 'network_error',
        message: NETWORK_ERROR_MESSAGE,
      };
    }
  }

  private buildErrorResult(status: number, json: any): MyClassErrorResult {
    const code = String(
      json?.code ?? (status >= 500 ? 'server_error' : 'request_failed'),
    );
    const defaultMsg =
      status >= 500
        ? 'خطای داخلی سرور سایت رخ داد؛ لطفاً لحظاتی دیگر دوباره تلاش کنید.'
        : 'درخواست با خطا مواجه شد؛ لطفاً دوباره تلاش کنید.';
    const message =
      typeof json?.message === 'string' && json.message.trim() !== ''
        ? json.message.trim()
        : defaultMsg;

    return { ok: false, status, code, message };
  }

  lookupNationalCode(nationalCode: string, baleUserId: number): Promise<MyClassLookupResult> {
    return this.postJson('/lookup', {
      national_code: nationalCode,
      bale_user_id: String(baleUserId),
    });
  }

  checkInAttendance(
    studentId: number,
    nationalCode: string,
    baleUserId: number,
    period?: number,
  ): Promise<MyClassCheckInResult> {
    const body: Record<string, unknown> = {
      student_id: studentId,
      national_code: nationalCode,
      bale_user_id: String(baleUserId),
    };
    if (period !== undefined) {
      body.period = period;
    }
    return this.postJson('/attendance/check-in', body);
  }

  listHomeworks(studentId: number, nationalCode: string): Promise<MyClassHomeworksResult> {
    return this.postJson('/homeworks', {
      student_id: studentId,
      national_code: nationalCode,
    });
  }

  async submitHomework(
    homeworkId: number,
    studentId: number,
    nationalCode: string,
    files: Array<{ buffer: Buffer; filename: string; mime: string }>,
    note?: string,
  ): Promise<MyClassSubmitResult> {
    if (!this.isConfigured()) return NOT_CONFIGURED_ERROR;

    try {
      const form = new FormData();
      form.append('student_id', String(studentId));
      form.append('national_code', nationalCode);
      if (note !== undefined && note.trim() !== '') {
        form.append('note', note.trim());
      }
      for (const f of files) {
        form.append(
          'files[]',
          new Blob([new Uint8Array(f.buffer)], { type: f.mime }),
          f.filename,
        );
      }

      const res = await this.fetchImpl(this.endpoint(`/homeworks/${homeworkId}/submit`), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.botToken}`,
        },
        body: form,
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) {
        return this.buildErrorResult(res.status, json);
      }

      return json as MyClassSubmitResult;
    } catch {
      return {
        ok: false,
        status: 0,
        code: 'network_error',
        message: NETWORK_ERROR_MESSAGE,
      };
    }
  }
}
