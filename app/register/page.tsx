'use client';

import { useState, type FormEvent } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import Link from 'next/link';

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<{
    firstName?: string;
    lastName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validate = (): boolean => {
    const next: {
      firstName?: string;
      lastName?: string;
      email?: string;
      password?: string;
      confirmPassword?: string;
    } = {};
    if (!formData.firstName.trim()) next.firstName = 'First name is required';
    if (!formData.lastName.trim()) next.lastName = 'Last name is required';
    if (!formData.email.trim()) next.email = 'Email is required';
    else if (!emailRegex.test(formData.email)) next.email = 'Enter a valid email address';
    if (!formData.password) next.password = 'Password is required';
    else if (formData.password.length < 8) next.password = 'Password must be at least 8 characters';
    if (!formData.confirmPassword) next.confirmPassword = 'Please repeat your password';
    else if (formData.confirmPassword !== formData.password) next.confirmPassword = 'Passwords do not match';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: formData.firstName,
          last_name: formData.lastName,
          email: formData.email,
          password: formData.password,
        }),
      });

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || 'Registration failed');
      }

      await login({
        email: formData.email,
        password: formData.password,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="_social_registration_wrapper _layout_main_wrapper">
      <div className="_shape_one">
        <img src="/assets/images/shape1.svg" alt="" className="_shape_img" />
        <img src="/assets/images/dark_shape.svg" alt="" className="_dark_shape" />
      </div>
      <div className="_shape_two">
        <img src="/assets/images/shape2.svg" alt="" className="_shape_img" />
        <img src="/assets/images/dark_shape1.svg" alt="" className="_dark_shape _dark_shape_opacity" />
      </div>
      <div className="_shape_three">
        <img src="/assets/images/shape3.svg" alt="" className="_shape_img" />
        <img src="/assets/images/dark_shape2.svg" alt="" className="_dark_shape _dark_shape_opacity" />
      </div>
      <div className="_social_registration_wrap">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-xl-8 col-lg-8 col-md-12 col-sm-12">
              <div className="_social_registration_right">
                <div className="_social_registration_right_image">
                  <img src="/assets/images/registration.png" alt="Image" />
                </div>
                <div className="_social_registration_right_image_dark">
                  <img src="/assets/images/registration1.png" alt="Image" />
                </div>
              </div>
            </div>
            <div className="col-xl-4 col-lg-4 col-md-12 col-sm-12">
              <div className="_social_registration_content">
                <div className="_social_registration_right_logo _mar_b28">
                  <img src="/assets/images/logo.svg" alt="Image" className="_right_logo" />
                </div>
                <p className="_social_registration_content_para _mar_b8">Get Started Now</p>
                <h4 className="_social_registration_content_title _titl4 _mar_b50">Registration</h4>
                {error && (
                  <p className="_social_registration_content_para _mar_b8" style={{ color: '#e74c3c' }}>{error}</p>
                )}
                <button
                  type="button"
                  className="_social_registration_content_btn _mar_b40"
                  onClick={() => setError('Google sign-in is not available yet. Please use email and password.')}
                >
                  <img src="/assets/images/google.svg" alt="Image" className="_google_img" />{' '}
                  <span>Register with google</span>
                </button>
                <div className="_social_registration_content_bottom_txt _mar_b40"> <span>Or</span>
                </div>
                <form className="_social_registration_form" onSubmit={handleSubmit} noValidate>
                  <div className="row">
                    <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
                      <div className="_social_registration_form_input _mar_b14">
                        <label className="_social_registration_label _mar_b8">First Name</label>
                        <input
                          type="text"
                          name="firstName"
                          value={formData.firstName}
                          onChange={handleChange}
                          className={`form-control _social_registration_input ${errors.firstName ? '_social_registration_input_error' : ''}`}
                        />
                        {errors.firstName && <p className="_field_error">{errors.firstName}</p>}
                      </div>
                    </div>
                    <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
                      <div className="_social_registration_form_input _mar_b14">
                        <label className="_social_registration_label _mar_b8">Last Name</label>
                        <input
                          type="text"
                          name="lastName"
                          value={formData.lastName}
                          onChange={handleChange}
                          className={`form-control _social_registration_input ${errors.lastName ? '_social_registration_input_error' : ''}`}
                        />
                        {errors.lastName && <p className="_field_error">{errors.lastName}</p>}
                      </div>
                    </div>
                    <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
                       <div className="_social_registration_form_input _mar_b14">
                         <label className="_social_registration_label _mar_b8">Email</label>
                         <input
                           type="email"
                           name="email"
                           className={`form-control _social_registration_input ${errors.email ? '_social_registration_input_error' : ''}`}
                           value={formData.email}
                           onChange={handleChange}
                         />
                         {errors.email && <p className="_field_error">{errors.email}</p>}
                       </div>
                     </div>
                     <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
                       <div className="_social_registration_form_input _mar_b14">
                         <label className="_social_registration_label _mar_b8">Password</label>
                         <input
                           type="password"
                           name="password"
                           className={`form-control _social_registration_input ${errors.password ? '_social_registration_input_error' : ''}`}
                           value={formData.password}
                           onChange={handleChange}
                         />
                         {errors.password && <p className="_field_error">{errors.password}</p>}
                       </div>
                     </div>
                     <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
                       <div className="_social_registration_form_input _mar_b14">
                         <label className="_social_registration_label _mar_b8">Repeat Password</label>
                         <input
                           type="password"
                           name="confirmPassword"
                           className={`form-control _social_registration_input ${errors.confirmPassword ? '_social_registration_input_error' : ''}`}
                           value={formData.confirmPassword}
                           onChange={handleChange}
                         />
                         {errors.confirmPassword && <p className="_field_error">{errors.confirmPassword}</p>}
                       </div>
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-lg-12 col-xl-12 col-md-12 col-sm-12">
                      <div className="form-check _social_registration_form_check">
                        <input className="form-check-input _social_registration_form_check_input" type="radio" name="flexRadioDefault" id="flexRadioDefault2" defaultChecked />
                        <label className="form-check-label _social_registration_form_check_label" htmlFor="flexRadioDefault2">I agree to terms & conditions</label>
                      </div>
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-lg-12 col-md-12 col-xl-12 col-sm-12">
                      <div className="_social_registration_form_btn _mar_t40 _mar_b60">
                        <button type="submit" className="_social_registration_form_btn_link _btn1" disabled={isSubmitting}>
                          {isSubmitting ? 'Creating account...' : 'Login now'}
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
                <div className="row">
                  <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
                    <div className="_social_registration_bottom_txt">
                      <p className="_social_registration_bottom_txt_para">
                        Already have an account? <Link href="/login">Login</Link>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
