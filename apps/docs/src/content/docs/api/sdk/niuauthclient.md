---
title: "NiuAuthClient"
description: "Generated TypeScript declaration for NiuAuthClient"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/auth.ts). [All SDK types](/docs/api/sdk/).

## Constructor and members

### constructor

```typescript
constructor(options?: NiuAuthOptions);
```

### #private

```typescript
#private;
```

### getMemberAuthenticationConfiguration

```typescript
/** Public capability discovery, independent of sign-in success. */
getMemberAuthenticationConfiguration(options?: RequestOptions): Promise<{
    password_login: boolean;
}>;
```

### signIn

```typescript
signIn(input: {
    email: string;
    password: string;
}, options?: RequestOptions): Promise<MemberSignIn>;
```

### signOut

```typescript
signOut(token: string, options?: RequestOptions): Promise<void>;
```

### changePassword

```typescript
/** Prove the current password and revoke every own session on success. */
changePassword(token: string, input: {
    current_password: string;
    password: string;
}, options?: RequestOptions): Promise<{
    revision: number;
    sign_in_required: true;
}>;
```
