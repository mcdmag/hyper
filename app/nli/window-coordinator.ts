import type {NliAuthState} from '../../typings/nli';

import type {NliService} from './service';

export interface NliWindowRegistration {
  readonly service: Pick<NliService, 'logout' | 'resetPrivacyPreferences'>;
  readonly broadcastAuth: (auth: NliAuthState) => void;
}

export interface NliWindowCoordinator {
  register(registration: NliWindowRegistration): () => void;
  resetPrivacy(): Promise<void>;
  logout(): Promise<void>;
}

class NliWindowCoordinatorImpl implements NliWindowCoordinator {
  private readonly registrations = new Set<NliWindowRegistration>();

  register(registration: NliWindowRegistration): () => void {
    this.registrations.add(registration);
    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      this.registrations.delete(registration);
    };
  }

  async resetPrivacy(): Promise<void> {
    const registrations = [...this.registrations];
    await Promise.all(registrations.map(({service}) => service.resetPrivacyPreferences()));
    registrations.forEach(({broadcastAuth}) => broadcastAuth({status: 'unknown'}));
  }

  async logout(): Promise<void> {
    const registrations = [...this.registrations];
    await Promise.all(registrations.map(({service}) => service.logout()));
    registrations.forEach(({broadcastAuth}) => broadcastAuth({status: 'signed-out'}));
  }
}

export const createNliWindowCoordinator = (): NliWindowCoordinator => new NliWindowCoordinatorImpl();

export const nliWindowCoordinator = createNliWindowCoordinator();
