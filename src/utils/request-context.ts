import { AsyncLocalStorage } from 'async_hooks';

export interface UserContext {
  userId: string;
  orgId: string;
}

const storage = new AsyncLocalStorage<UserContext>();

export const RequestContext = {
  run(context: UserContext, fn: () => any) {
    return storage.run(context, fn);
  },
  get(): UserContext | undefined {
    return storage.getStore();
  },
  getUserId(): string | undefined {
    return storage.getStore()?.userId;
  },
  getOrgId(): string | undefined {
    return storage.getStore()?.orgId;
  }
};
