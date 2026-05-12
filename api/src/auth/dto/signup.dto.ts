import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SignupDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt's max input length
  password!: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  displayName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  workspaceName?: string;
}
