import { validate } from 'class-validator';
import { RegisterDto } from '../src/auth/dto/auth.dto';
import { AuthService } from '../src/auth/auth.service';
describe('Registro sin correo', () => {
  it('acepta nombre, identificación y contraseña sin correo', async () => {
    const dto = Object.assign(new RegisterDto(), { nombre: 'Prueba', ruc: '0912345678', password: 'Prueba123' });
    expect(await validate(dto)).toHaveLength(0);
    const prisma: any = {user:{ findUnique:jest.fn(), create:jest.fn().mockResolvedValue({id:'user',email:null,sessionVersion:0}) },refreshToken:{create:jest.fn()}};
    const jwt: any = {signAsync:jest.fn().mockResolvedValue('test-token')};
    const service = new AuthService(prisma,jwt,{registrar:jest.fn()} as any);
    await expect(service.register(dto)).resolves.toMatchObject({accessToken:'test-token'});
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.create.mock.calls[0][0].data).toMatchObject({ruc:'0912345678',nombre:'Prueba'});
    expect(prisma.user.create.mock.calls[0][0].data.email).toBeUndefined();
  });
});
