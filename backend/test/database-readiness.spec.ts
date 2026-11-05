const {checkDatabase} = require('../scripts/check-database.cjs');

describe('Preparación de la base para publicar', () => {
  const migration = {name:'20261031000300_ats_operations',checksum:'correcto'};
  const successful = {migration_name:migration.name,checksum:'correcto',finished_at:new Date(),rolled_back_at:null};
  it('detecta migraciones pendientes sin consultar tablas aún inexistentes', async () => {
    const client = {$queryRaw:jest.fn().mockResolvedValue([])};
    expect(await checkDatabase(client,[migration])).toEqual({ready:false,pending:[migration.name],modified:[],failed:[]});
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it('rechaza migraciones alteradas y ejecuciones fallidas', async () => {
    const client = {$queryRaw:jest.fn().mockResolvedValue([{...successful,checksum:'alterado'},{...successful,finished_at:null}])};
    expect(await checkDatabase(client,[migration])).toEqual({ready:false,pending:[],modified:[migration.name],failed:[migration.name]});
  });
  it('verifica columnas y solo utiliza consultas SELECT', async () => {
    const client = {$queryRaw:jest.fn().mockResolvedValueOnce([successful]).mockResolvedValue([])};
    expect((await checkDatabase(client,[migration])).ready).toBe(true);
    expect(client.$queryRaw).toHaveBeenCalledTimes(3);
    for (const call of client.$queryRaw.mock.calls) expect(String(call[0][0]).trim()).toMatch(/^SELECT /);
  });
  it('no expone credenciales ni errores internos de conexión', async () => {
    const client = {$queryRaw:jest.fn().mockRejectedValue(new Error('postgresql://owner:secreto@host/db'))};
    const result = await checkDatabase(client,[migration]);
    expect(result.ready).toBe(false);
    expect(JSON.stringify(result)).not.toContain('secreto');
  });
  it('acepta diferencias de finales de línea Windows/Linux sin ignorar cambios SQL', async () => {
    const client = {$queryRaw:jest.fn().mockResolvedValueOnce([{...successful,checksum:'windows'}]).mockResolvedValue([])};
    expect((await checkDatabase(client,[{...migration,compatibleChecksums:['windows']}])).ready).toBe(true);
  });
});
