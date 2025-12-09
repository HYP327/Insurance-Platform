const readline = require('readline');
const chalk = require('chalk');
const { authenticateUser, sendOTP } = require('./utils/auth');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function login() {
  console.log(chalk.cyan('\n🔐 Cloud Storage Login\n'));
  
  rl.question('Email: ', async (email) => {
    rl.question('Password: ', async (password) => {
      console.log(chalk.yellow('\nVerifying credentials...'));
      
      // Check credentials
      const isValid = await authenticateUser(email, password);
      
      if (!isValid) {
        console.log(chalk.red('Invalid credentials!'));
        rl.close();
        return;
      }
      
      console.log(chalk.green('✓ Credentials verified'));
      console.log(chalk.yellow('Sending OTP to your email...'));
      
      // Send OTP
      const otpSent = await sendOTP(email);
      
      if (!otpSent) {
        console.log(chalk.red('Failed to send OTP'));
        rl.close();
        return;
      }
      
      console.log(chalk.green('✓ OTP sent to your email'));
      
      rl.question('Enter OTP: ', (otp) => {
        // Verify OTP (simplified)
        if (otp.length === 6) {
          console.log(chalk.green('\n✓ Login successful!'));
          console.log(chalk.cyan('\nWelcome to Cloud Storage System'));
          console.log('\nOptions:');
          console.log('1. Open User Dashboard');
          console.log('2. Connect as Node');
          console.log('3. Exit');
          
          rl.question('\nChoose option (1-3): ', (choice) => {
            switch(choice) {
              case '1':
                console.log('Starting user dashboard...');
                // Launch user dashboard
                require('./dashboard/user_dashboard').startDashboard(email);
                break;
              case '2':
                console.log('Run: node main.js --node --id your-node-id');
                break;
              default:
                console.log('Goodbye!');
            }
            rl.close();
          });
        } else {
          console.log(chalk.red('Invalid OTP'));
          rl.close();
        }
      });
    });
  });
}

login();