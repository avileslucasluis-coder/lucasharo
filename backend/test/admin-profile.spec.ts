import { AccountProfileDto, AdminController } from '../src/auth/admin.controller';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma } from '@prisma/client';

describe('Edición administrativa de cuentas', () => {
  function fixture(admin = true) {
    const tx = {
      $executeRaw: jest.fn(),
      user: { findUnique: jest.fn().mockResolvedValueOnce({ id: 'admin', activo: true, platformAdmin: admin })
        .mockResolvedValueOnce({ id: 'target', nombre: 'Anterior', ruc: null }), update: jest.fn().mockResolvedValue({ id: 'target', nombre: 'Nuevo', ruc: '0915926224' }) },
      refreshToken: { updateMany: jest.fn() }, auditLog: { create: jest.fn() },
    };
    const service = new AdminController({ $transaction: (fn: any) => fn(tx) } as any, {} as any);
    return { tx, service };
  }
  const dto = { nombre: 'Nuevo', ruc: '0915926224' };
  it('niega cambios a usuarios sin privilegios antes de leer la cuenta destino', async () => {
    const { tx, service } = fixture(false);
    await expect(service.changeProfile({ user: { userId: 'admin' } }, 'target', dto)).rejects.toThrow('reservado');
    expect(tx.user.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('registra valores anteriores, revoca sesiones y solo modifica campos permitidos', async () => {
    const { tx, service } = fixture();
    await service.changeProfile({ user: { userId: 'admin' } }, 'target', dto);
    expect(tx.user.update.mock.calls[0][0].data).toEqual({ ...dto, sessionVersion: { increment: 1 } });
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({ where: { userId: 'target' }, data: { revocado: true } });
    expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({ userId: 'admin', registroId: 'target',
      valorAnterior: { nombre: 'Anterior', ruc: null }, valorNuevo: dto });
  });
  it('presenta un error comprensible si la identificación está ocupada', async () => {
    const { tx, service } = fixture();
    tx.user.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicado', { code: 'P2002', clientVersion: '5' }));
    await expect(service.changeProfile({ user: { userId: 'admin' } }, 'target', dto)).rejects.toThrow('Ya existe');
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
  it('no admite un nombre vacío ni identificación mal formada', async () => {
    expect((await validate(plainToInstance(AccountProfileDto, { nombre: '  ', ruc: 'abc' }))).length).toBe(2);
    expect(await validate(plainToInstance(AccountProfileDto, dto))).toHaveLength(0);
  });
  it('una corrección de nombre conserva las sesiones si la identificación no cambia', async () => {
    const { tx, service } = fixture();
    tx.user.findUnique.mockReset().mockResolvedValueOnce({ id: 'admin', activo: true, platformAdmin: true })
      .mockResolvedValueOnce({ id: 'target', nombre: 'Anterior', ruc: dto.ruc });
    await service.changeProfile({ user: { userId: 'admin' } }, 'target', dto);
    expect(tx.user.update.mock.calls[0][0].data).toEqual(dto);
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
  });
  it('rechaza cuentas inexistentes sin escribir cambios', async () => {
    const { tx, service } = fixture();
    tx.user.findUnique.mockReset().mockResolvedValueOnce({ id: 'admin', activo: true, platformAdmin: true }).mockResolvedValueOnce(null);
    await expect(service.changeProfile({ user: { userId: 'admin' } }, 'missing', dto)).rejects.toThrow('no encontrada');
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
