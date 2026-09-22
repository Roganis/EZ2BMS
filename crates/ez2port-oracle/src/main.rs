//! `ez2port-oracle` - thin Rust entry point for the C front end in
//! `csrc/oracle.c`, which does all the work against EZ2PORT's vendored core.
//! See that file for the command list. Test-only; never shipped.

use std::ffi::{c_char, c_int, CString};

extern "C" {
    fn ez2bms_oracle_main(argc: c_int, argv: *mut *mut c_char) -> c_int;
}

fn main() {
    let args: Vec<CString> = std::env::args_os()
        .map(|a| CString::new(a.to_string_lossy().into_owned()).expect("argument contains NUL"))
        .collect();
    let mut ptrs: Vec<*mut c_char> = args.iter().map(|a| a.as_ptr() as *mut c_char).collect();
    ptrs.push(std::ptr::null_mut());
    // SAFETY: argv is a NUL-terminated array of valid C strings that outlive the call.
    let rc = unsafe { ez2bms_oracle_main(args.len() as c_int, ptrs.as_mut_ptr()) };
    std::process::exit(rc);
}
