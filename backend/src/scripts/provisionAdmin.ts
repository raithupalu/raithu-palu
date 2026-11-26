import readline from 'readline';
import { Writable } from 'stream';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { authService } from '../services/authService';
import { AppError } from '../middleware/notFound';

export function parseCliArg(
  flagName: string,
  args: readonly string[] = process.argv.slice(2)
): string | undefined {
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

export function containsForbiddenPasswordCliFlag(
  args: readonly string[] = process.argv.slice(2)
): boolean {
  return args.some(
    (arg) => arg === '--password' || arg.startsWith('--password=')
  );
}

function promptMaskedPassword(promptLabel: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(
        new AppError(
          400,
          'ADMIN_PASSWORD_REQUIRED',
          'ADMIN_PASSWORD environment variable is required when running in a non-interactive terminal.'
        )
      );
      return;
    }

    let muted = false;
    const mutableStdout = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) {
          process.stdout.write(chunk, encoding);
        } else {
          const text = chunk.toString();
          if (text.includes('\n') || text.includes('\r')) {
            process.stdout.write('\n');
          } else if (text.length > 0) {
            process.stdout.write('*');
          }
        }
        callback();
      },
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: mutableStdout,
      terminal: true,
    });

    rl.question(promptLabel, (answer) => {
      muted = false;
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

export async function resolveProvisionAdminInputs(
  args: readonly string[] = process.argv.slice(2),
  envVars: NodeJS.ProcessEnv = process.env
): Promise<{
  fullName: string;
  mobileNumber: string;
  password: string;
}> {
  if (containsForbiddenPasswordCliFlag(args)) {
    throw new AppError(
      400,
      'INSECURE_CLI_PASSWORD_FORBIDDEN',
      'Passing --password via CLI flags is disabled to prevent plaintext password exposure in shell history and process logs. Provide ADMIN_PASSWORD via environment variable or use the interactive masked prompt.'
    );
  }

  const fullName =
    parseCliArg('name', args) ??
    envVars.ADMIN_FULL_NAME ??
    'Raithu Palu System Admin';
  const mobileNumber =
    parseCliArg('mobile', args) ?? envVars.ADMIN_MOBILE ?? '';

  let password = envVars.ADMIN_PASSWORD ?? '';
  if (!password && process.stdin.isTTY) {
    password = await promptMaskedPassword('Enter Admin Password (masked): ');
  }

  if (!mobileNumber || !password) {
    throw new AppError(
      400,
      'MISSING_PROVISIONING_INPUTS',
      'Usage: ADMIN_MOBILE=<10-digit-mobile> ADMIN_PASSWORD=<secret> npm --prefix backend run provision:admin [-- --name "Admin Name"]\n' +
        'Or run interactively in a TTY with --mobile <10-digit-mobile> to enter the password via masked prompt.'
    );
  }

  return {
    fullName,
    mobileNumber,
    password,
  };
}

export async function runProvisionAdmin(): Promise<void> {
  try {
    const { fullName, mobileNumber, password } =
      await resolveProvisionAdminInputs();

    await connectDatabase();
    const { user } = await authService.provisionOperatorAdmin({
      fullName,
      mobileNumber,
      password,
    });

    console.log(
      JSON.stringify(
        {
          status: 'ok',
          action: 'CREATED',
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

if (require.main === module) {
  void runProvisionAdmin();
}
