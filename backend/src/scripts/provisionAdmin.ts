import { connectDatabase, disconnectDatabase } from '../config/database';
import { authService } from '../services/authService';

function parseCliArg(flagName: string): string | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === `--${flagName}` && args[i + 1]) {
      return args[i + 1];
    }
    if (arg.startsWith(`--${flagName}=`)) {
      return arg.slice(`--${flagName}=`.length);
    }
  }
  return undefined;
}

async function runProvisionAdmin(): Promise<void> {
  const fullName =
    parseCliArg('name') ?? process.env.ADMIN_FULL_NAME ?? 'Raithu Palu System Admin';
  const mobileNumber =
    parseCliArg('mobile') ?? process.env.ADMIN_MOBILE;
  const password =
    parseCliArg('password') ?? process.env.ADMIN_PASSWORD;

  if (!mobileNumber || !password) {
    console.error(
      'Usage: npm --prefix backend run provision:admin -- --mobile <10-digit-mobile> --password <password> [--name "Admin Name"]\n' +
        'Or provide ADMIN_MOBILE, ADMIN_PASSWORD, and optional ADMIN_FULL_NAME environment variables.'
    );
    process.exit(1);
  }

  try {
    await connectDatabase();
    const { user, created } = await authService.provisionOperatorAdmin({
      fullName,
      mobileNumber,
      password,
    });

    console.log(
      JSON.stringify(
        {
          status: 'ok',
          action: created ? 'CREATED' : 'UPDATED',
          userCode: user.userCode,
          fullName: user.fullName,
          mobileNumber: user.mobileNumber,
          role: user.role,
          accountStatus: user.status,
        },
        null,
        2
      )
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[AdminProvisioningError] ${message}`);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

void runProvisionAdmin();
