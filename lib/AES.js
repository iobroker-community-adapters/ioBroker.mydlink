/*
    The MIT License (MIT)

    Copyright (c) 2015 bikerp

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
*/

let AES_Sbox_Inv;
let AES_ShiftRowTab_Inv;
let AES_xtime;

/*
  v1.00 Jan.21.2014
*/
function AES_Init() {
    AES_Sbox_Inv = new Array(256);
    for(let i = 0; i < 256; i++)
        AES_Sbox_Inv[AES_Sbox[i]] = i;

    AES_ShiftRowTab_Inv = new Array(16);
    for(let i = 0; i < 16; i++)
        AES_ShiftRowTab_Inv[AES_ShiftRowTab[i]] = i;

    AES_xtime = new Array(256);
    for(let i = 0; i < 128; i++) {
        AES_xtime[i] = i << 1;
        AES_xtime[128 + i] = (i << 1) ^ 0x1b;
    }
}

/*
   AES_Done: release memory reserved by AES_Init. Call this function after
   the last encryption/decryption operation.
*/

function AES_Done() {
    AES_Sbox_Inv = undefined;
    AES_ShiftRowTab_Inv = undefined;
    AES_xtime = undefined;
}

/*
   AES_ExpandKey: expand a cipher key. Depending on the desired encryption
   strength of 128, 192 or 256 bits 'key' has to be a byte array of length
   16, 24 or 32, respectively. The key expansion is done "in place", meaning
   that the array 'key' is modified.
*/
/* No longer use.
function AES_ExpandKey(key) {
	var kl = key.length, ks, Rcon = 1;
	switch (kl) {
	case 16:
		ks = 16 * (10 + 1);
		break;
	case 24:
		ks = 16 * (12 + 1);
		break;
	case 32:
		ks = 16 * (14 + 1);
		break;
	default:
		alert("AES_ExpandKey: Only key lengths of 16, 24 or 32 bytes allowed!");
	}
	for(var i = kl; i < ks; i += 4) {
		var temp = key.slice(i - 4, i);
		if (i % kl == 0) {
			temp = new Array(AES_Sbox[temp[1]] ^ Rcon, AES_Sbox[temp[2]],
											 AES_Sbox[temp[3]], AES_Sbox[temp[0]]);
			if ((Rcon <<= 1) >= 256)
				Rcon ^= 0x11b;
		} else if ((kl > 24) && (i % kl == 16))
			temp = new Array(AES_Sbox[temp[0]], AES_Sbox[temp[1]],
											 AES_Sbox[temp[2]], AES_Sbox[temp[3]]);
		for(var j = 0; j < 4; j++)
			key[i + j] = key[i + j - kl] ^ temp[j];
	}
	return key;
}
*/
/*
   AES_Encrypt: encrypt the 16 byte array 'block' with the previously
   expanded key 'key'.
*/

function AES_Encrypt(block, key) {
    const l = key.length;
    AES_AddRoundKey(block, key.slice(0, 16));
    let i;
    for(i = 16; i < l - 16; i += 16) {
        AES_SubBytes(block, AES_Sbox);
        AES_ShiftRows(block, AES_ShiftRowTab);
        AES_MixColumns(block);
        AES_AddRoundKey(block, key.slice(i, i + 16));
    }
    AES_SubBytes(block, AES_Sbox);
    AES_ShiftRows(block, AES_ShiftRowTab);
    AES_AddRoundKey(block, key.slice(i, l));
    return block;
}

/******************************************************************************/

/* The following lookup tables and functions are for internal use only! */

const AES_Sbox = new Array(99, 124, 119, 123, 242, 107, 111, 197, 48, 1, 103, 43, 254, 215, 171,
    118, 202, 130, 201, 125, 250, 89, 71, 240, 173, 212, 162, 175, 156, 164, 114, 192, 183, 253,
    147, 38, 54, 63, 247, 204, 52, 165, 229, 241, 113, 216, 49, 21, 4, 199, 35, 195, 24, 150, 5, 154,
    7, 18, 128, 226, 235, 39, 178, 117, 9, 131, 44, 26, 27, 110, 90, 160, 82, 59, 214, 179, 41, 227,
    47, 132, 83, 209, 0, 237, 32, 252, 177, 91, 106, 203, 190, 57, 74, 76, 88, 207, 208, 239, 170,
    251, 67, 77, 51, 133, 69, 249, 2, 127, 80, 60, 159, 168, 81, 163, 64, 143, 146, 157, 56, 245,
    188, 182, 218, 33, 16, 255, 243, 210, 205, 12, 19, 236, 95, 151, 68, 23, 196, 167, 126, 61,
    100, 93, 25, 115, 96, 129, 79, 220, 34, 42, 144, 136, 70, 238, 184, 20, 222, 94, 11, 219, 224,
    50, 58, 10, 73, 6, 36, 92, 194, 211, 172, 98, 145, 149, 228, 121, 231, 200, 55, 109, 141, 213,
    78, 169, 108, 86, 244, 234, 101, 122, 174, 8, 186, 120, 37, 46, 28, 166, 180, 198, 232, 221,
    116, 31, 75, 189, 139, 138, 112, 62, 181, 102, 72, 3, 246, 14, 97, 53, 87, 185, 134, 193, 29,
    158, 225, 248, 152, 17, 105, 217, 142, 148, 155, 30, 135, 233, 206, 85, 40, 223, 140, 161,
    137, 13, 191, 230, 66, 104, 65, 153, 45, 15, 176, 84, 187, 22);

const AES_ShiftRowTab = new Array(0,5,10,15,4,9,14,3,8,13,2,7,12,1,6,11);

function AES_SubBytes(state, sbox) {
    for(let i = 0; i < 16; i++)
        state[i] = sbox[state[i]];
}

function AES_AddRoundKey(state, rkey) {
    for(let i = 0; i < 16; i++)
        state[i] ^= rkey[i];
}

function AES_ShiftRows(state, shifttab) {
    const h = [].concat(state);
    for(let i = 0; i < 16; i++)
        state[i] = h[shifttab[i]];
}

function AES_MixColumns(state) {
    for(let i = 0; i < 16; i += 4) {
        const s0 = state[i + 0], s1 = state[i + 1];
        const s2 = state[i + 2], s3 = state[i + 3];
        const h = s0 ^ s1 ^ s2 ^ s3;
        state[i + 0] ^= h ^ AES_xtime[s0 ^ s1];
        state[i + 1] ^= h ^ AES_xtime[s1 ^ s2];
        state[i + 2] ^= h ^ AES_xtime[s2 ^ s3];
        state[i + 3] ^= h ^ AES_xtime[s3 ^ s0];
    }
}

function hexstr2array(input, length) {
    const output = new Array(length);
    let i=0;

    for (i=0; i<length; i++) {
        if (i < input.length/2) {
            output[i] = parseInt(input.substr(i*2,2),16);
        } else {
            output[i] = 0;
        }
    }
    return output;
}

function str2hexstr(input) {
    let output='';
    for (let a = 0; a < input.length; a = a + 1) {
        output = output + input.charCodeAt(a).toString(16);
    }
    return output;
}

function array2hexstr(input) {
    const len=input.length;
    let output='';
    for (let i=0; i< len; i++) {
        let tmp=input[i].toString(16);
        if (tmp.length == 1) {
            tmp = '0' + tmp;
        }
        output = output + tmp;
    }
    return output;
}

exports.AES_Encrypt128 = function (passwd, PrivateKey)
{
    const passwd_hex = str2hexstr(passwd);

    if (PrivateKey.length > 32) {
        PrivateKey = PrivateKey.substr(0,32);
    }

    const private_key_byte = hexstr2array(PrivateKey, 32);
    const passwd_byte = hexstr2array(passwd_hex, 64);
    let output='';
    const output_byte = new Array(64);
    AES_Init();

    for (let i=0; i<4; i++) {
        let block = new Array(16);

        for (let j=0; j<16; j++)
        {
            block[j] = passwd_byte[i*16+j];
        }
        block = AES_Encrypt(block,private_key_byte);

        for (let j=0; j<16; j++)
        {
            output_byte[i*16+j] = block[j];
        }
    }

    output = array2hexstr(output_byte);
    AES_Done();
    return output;
};

