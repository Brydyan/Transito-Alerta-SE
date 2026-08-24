import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { AuthService } from '../auth/auth.service';

describe('InvitationsController (T3.6 design §6.2)', () => {
  let invitationsService: {
    createInvitation: jest.Mock;
    listPending: jest.Mock;
    previewInvitation: jest.Mock;
    deletePending: jest.Mock;
  };
  let controller: InvitationsController;

  beforeEach(() => {
    invitationsService = {
      createInvitation: jest.fn(),
      listPending: jest.fn(),
      previewInvitation: jest.fn(),
      deletePending: jest.fn(),
    };
    controller = new InvitationsController(
      invitationsService as unknown as InvitationsService,
      {} as AuthService,
    );
  });

  function req(): AuthenticatedRequest {
    return {
      user: {
        userId: 'actor-1',
        permissions: ['CREATE invitations'],
        organizationId: 'org-1',
        roleName: 'admin_organizacion',
        scope: { kind: 'org', organizationId: 'org-1' },
        sessionId: 'sid-1',
        isAnonymous: false,
      },
    } as unknown as AuthenticatedRequest;
  }

  it('POST admin/users/invite delegates with the full actor and mapped input', async () => {
    invitationsService.createInvitation.mockResolvedValue({ id: 'inv-1' });

    const result = await controller.invite(
      { email: 'a@b.com', role_id: 'role-1', organization_id: 'org-1' },
      req(),
    );

    expect(invitationsService.createInvitation).toHaveBeenCalledWith(req().user, {
      email: 'a@b.com',
      roleId: 'role-1',
      organizationId: 'org-1',
    });
    expect(result).toEqual({ id: 'inv-1' });
  });

  it('POST admin/users/invite maps a missing organization_id to null', async () => {
    invitationsService.createInvitation.mockResolvedValue({ id: 'inv-1' });

    await controller.invite({ email: 'a@b.com', role_id: 'role-1' }, req());

    expect(invitationsService.createInvitation).toHaveBeenCalledWith(
      req().user,
      expect.objectContaining({ organizationId: null }),
    );
  });

  it('GET invitations/pending delegates with the actor', async () => {
    invitationsService.listPending.mockResolvedValue([]);

    await controller.pending(req());

    expect(invitationsService.listPending).toHaveBeenCalledWith(req().user);
  });

  it('GET invitations/preview delegates with the raw token, no auth required', async () => {
    invitationsService.previewInvitation.mockResolvedValue({ role_name: 'reporter' });

    await controller.preview('some-token');

    expect(invitationsService.previewInvitation).toHaveBeenCalledWith('some-token');
  });

  it('DELETE invitations/:id delegates to deletePending', async () => {
    await controller.remove('inv-1');

    expect(invitationsService.deletePending).toHaveBeenCalledWith('inv-1');
  });
});
